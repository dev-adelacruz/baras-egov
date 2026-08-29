# frozen_string_literal: true

# Admin account management: provision, edit, deactivate and reactivate staff
# accounts and assign their role and office. Every action is guarded by the
# user_management module, which only admins hold (BRGY-38).
class Api::V1::Admin::UsersController < Api::V1::BaseController
  before_action :set_user, only: %i[update deactivate activate]

  # BRGY-127. Written as sentences an administrator can act on, because they
  # are the entire recovery instruction — there is no second admin to ask.
  SELF_DEACTIVATION = 'You cannot deactivate your own account. Another administrator has to do it for you.'
  LAST_ADMIN_DEACTIVATION = 'This is the only administrator who can still sign in. ' \
                            'Make another account an administrator first, or nobody will be able to manage accounts.'
  LAST_ADMIN_DEMOTION = 'This is the only administrator who can still sign in. ' \
                        "Make another account an administrator before changing this one's role."

  # GET /api/v1/admin/users — searchable by email, filterable by office.
  # BRGY-136 removed the barangay filter: one deployment, one barangay.
  def index
    authorize_module!(:user_management, :read)

    users = User.order(:email)
    users = users.where(office: params[:office]) if params[:office].present?
    users = users.where('email ILIKE ?', "%#{params[:search]}%") if params[:search].present?

    render json: {
      status: { code: 200, message: 'OK' },
      data: { users: UserBlueprint.render_as_hash(users, view: :admin) }
    }, status: :ok
  end

  # POST /api/v1/admin/users
  def create
    authorize_module!(:user_management, :manage)

    user = User.new(create_params)
    if user.save
      render_user(user, code: 201, message: 'Account created.', status: :created)
    else
      render_errors(user)
    end
  end

  # PATCH/PUT /api/v1/admin/users/:id
  def update
    authorize_module!(:user_management, :manage)

    reason = lockout_reason(role: update_params[:role], active: update_params[:active])
    return render_refusal(reason) if reason

    if @user.update(update_params)
      render_user(@user, code: 200, message: 'Account updated.')
    else
      render_errors(@user)
    end
  end

  # PATCH /api/v1/admin/users/:id/deactivate
  def deactivate
    authorize_module!(:user_management, :manage)

    reason = lockout_reason(active: false)
    return render_refusal(reason) if reason

    @user.update(active: false)
    render_user(@user, code: 200, message: 'Account deactivated.')
  end

  # PATCH /api/v1/admin/users/:id/activate
  def activate
    authorize_module!(:user_management, :manage)

    @user.update(active: true)
    render_user(@user, code: 200, message: 'Account reactivated.')
  end

  private

  def set_user
    @user = User.find(params[:id])
  end

  # The plain-language reason this change must be refused, or nil if it is
  # allowed. BRGY-127.
  #
  # Both routes into a lockout are checked in one place because there are two:
  # `deactivate` flips `active` directly, and `update` permits *both* `:active`
  # and `:role`. Guarding only the named action would leave PATCH able to do
  # by parameter exactly what the guarded endpoint refuses.
  #
  # It reasons about the state the account would end up in, not the parameter
  # that was sent, so a no-op (`active: true` on an already-active account) is
  # not mistaken for a change.
  def lockout_reason(role: nil, active: nil)
    new_active = active.nil? ? @user.active : ActiveModel::Type::Boolean.new.cast(active)
    new_role = role.presence || @user.role

    # Refused whether or not a second administrator exists: this ends the
    # caller's own session, and nobody else asked for that.
    return SELF_DEACTIVATION if @user == current_user && !new_active

    # Everything below only matters while this account holds the last seat.
    return nil unless @user.sole_active_admin?
    return LAST_ADMIN_DEACTIVATION unless new_active
    return LAST_ADMIN_DEMOTION if new_role != 'admin'

    nil
  end

  # Same envelope as a validation failure, so the frontend's existing error
  # path surfaces the sentence above rather than a generic string.
  def render_refusal(message)
    render json: { status: { code: 422, message: message } }, status: :unprocessable_entity
  end

  def create_params
    params.require(:user).permit(:email, :password, :role, :office, :active)
  end

  def update_params
    params.require(:user).permit(:role, :office, :active)
  end

  def render_user(user, code:, message:, status: :ok)
    render json: {
      status: { code: code, message: message },
      data: { user: UserBlueprint.render_as_hash(user, view: :admin) }
    }, status: status
  end

  def render_errors(user)
    render json: {
      status: { code: 422, message: user.errors.full_messages.to_sentence }
    }, status: :unprocessable_entity
  end
end
