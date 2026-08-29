# frozen_string_literal: true

# Server-side authorization for API controllers.
#
# Include in any authenticated controller and guard actions with
# `authorize_module!(:certifications, :write)`. Denied requests are logged and
# rendered as 403 — UI hiding on the frontend is never the enforcement point.
module Authorizable
  extend ActiveSupport::Concern

  class Forbidden < StandardError; end

  included do
    rescue_from Forbidden, with: :render_forbidden
  end

  # Raise (→ 403 + log) unless the current user may perform `action` on `mod`.
  def authorize_module!(mod, action)
    return if current_user&.can?(mod, action)

    log_denied_access(mod, action)
    raise Forbidden, "Not authorized to #{action} #{mod}"
  end

  # Apply the current user's data scope to a relation. Barangay-scoped users
  # only ever see their own barangay's records; everyone else sees all.
  def apply_data_scope(relation)
    scope = current_user&.data_scope
    scope.is_a?(Hash) ? relation.where(scope) : relation
  end

  private

  def log_denied_access(mod, action)
    Rails.logger.warn(
      "[authorization] denied user_id=#{current_user&.id} " \
      "role=#{current_user&.role} action=#{action} module=#{mod} path=#{request&.path}"
    )
  end

  def render_forbidden(exception)
    render json: {
      status: { code: 403, message: exception.message }
    }, status: :forbidden
  end
end
