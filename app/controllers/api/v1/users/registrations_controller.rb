# frozen_string_literal: true
class Api::V1::Users::RegistrationsController < Devise::RegistrationsController
  def respond_with(current_user, _opts = {})
    if resource.persisted?
      render json: {
        status: {code: 200, message: 'Signed up successfully.'},
        data: UserBlueprint.render_as_hash(current_user)
      }
    else
      render json: {
        status: {
          code: 422,
          message: "User couldn't be created successfully. #{current_user.errors.full_messages.to_sentence}"
        }
      }, status: :unprocessable_entity
    end
  end
end
