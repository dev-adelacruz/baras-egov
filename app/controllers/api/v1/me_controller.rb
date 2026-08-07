# frozen_string_literal: true

# Returns the authenticated user's identity, role, scope and permission map so
# the frontend can render role-aware navigation and controls (BRGY-39). This is
# a convenience surface — it never replaces server-side enforcement.
class Api::V1::MeController < Api::V1::BaseController
  def show
    render json: {
      status: { code: 200, message: 'OK' },
      data: { user: UserBlueprint.render_as_hash(current_user, view: :with_permissions) }
    }, status: :ok
  end
end
