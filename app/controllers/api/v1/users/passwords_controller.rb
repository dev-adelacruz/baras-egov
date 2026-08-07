# frozen_string_literal: true

class Api::V1::Users::PasswordsController < Devise::PasswordsController
  # POST /api/v1/users/password
  # Requests password reset instructions. Always responds 200 with a generic
  # message so the endpoint cannot be used to enumerate registered emails.
  def create
    resource_class.send_reset_password_instructions(reset_request_params)

    render json: {
      status: {
        code: 200,
        message: 'If that email is registered, password reset instructions have been sent.'
      }
    }, status: :ok
  end

  # PUT /api/v1/users/password
  # Completes a password reset using the emailed token.
  def update
    self.resource = resource_class.reset_password_by_token(reset_update_params)

    if resource.errors.empty?
      render json: {
        status: { code: 200, message: 'Password reset successfully.' },
        data: { user: UserBlueprint.render_as_hash(resource) }
      }, status: :ok
    else
      render json: {
        status: {
          code: 422,
          message: "Password reset failed. #{resource.errors.full_messages.to_sentence}"
        }
      }, status: :unprocessable_entity
    end
  end

  private

  def reset_request_params
    params.require(:user).permit(:email)
  end

  def reset_update_params
    params.require(:user).permit(:reset_password_token, :password, :password_confirmation)
  end
end
