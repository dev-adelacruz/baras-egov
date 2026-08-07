# frozen_string_literal: true

# Base class for authenticated API v1 controllers. Requires a valid JWT and
# provides the module-level authorization guards from Authorizable.
class Api::V1::BaseController < ApplicationController
  include Authorizable

  before_action :authenticate_user!

  private

  # devise-jwt authenticates via the Authorization header; render JSON (not a
  # redirect) when authentication fails.
  def authenticate_user!
    return if user_signed_in?

    render json: {
      status: { code: 401, message: 'Authentication required.' }
    }, status: :unauthorized
  end
end
