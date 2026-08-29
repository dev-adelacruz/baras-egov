# frozen_string_literal: true

# Admin account management: provision, edit, deactivate and reactivate staff
# accounts and assign their role and office. Every action is guarded by the
# user_management module, which only admins hold (BRGY-38).
class Api::V1::Admin::UsersController < Api::V1::BaseController
  before_action :set_user, only: %i[update deactivate activate]

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

    if @user.update(update_params)
      render_user(@user, code: 200, message: 'Account updated.')
    else
      render_errors(@user)
    end
  end

  # PATCH /api/v1/admin/users/:id/deactivate
  def deactivate
    authorize_module!(:user_management, :manage)

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
