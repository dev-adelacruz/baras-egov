# frozen_string_literal: true

class Api::V1::Users::SessionsController < Devise::SessionsController
  def create
    self.resource = warden.authenticate!(auth_options)
    sign_in(resource_name, resource)

    render json: {
      status: { code: 200, message: 'Logged in successfully.' },
      data: { user: UserBlueprint.render_as_hash(current_user) }
    }, status: :ok
  end

  def destroy
    signed_out = (Devise.sign_out_all_scopes ? sign_out : sign_out(resource_name))

    if signed_out
      render json: {
        status: { code: 200, message: 'Logged out successfully.' }
      }, status: :ok
    else
      render json: {
        status: { code: 422, message: 'There was a problem logging out.' }
      }, status: :unprocessable_entity
    end
  end

  def respond_with(current_user, _opts = {})
    render json: {
      status: { code: 200, message: 'Logged in successfully.' },
      data: { user: UserBlueprint.render_as_hash(current_user) }
    }, status: :ok
  end

  # Add token validation endpoint
  def validate_token
    if current_user
      render json: {
        status: { code: 200, message: 'Token is valid.' },
        data: { user: UserBlueprint.render_as_hash(current_user) }
      }, status: :ok
    else
      render json: {
        status: { code: 401, message: 'Invalid or expired token.' }
      }, status: :unauthorized
    end
  end
end
