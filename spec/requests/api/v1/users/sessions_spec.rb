# frozen_string_literal: true

require 'swagger_helper'

RSpec.describe 'Sessions' do
  let(:json_response) { JSON.parse(response.body, symbolize_names: true) }

  describe '#create' do # rubocop:disable RSpec/EmptyExampleGroup
    path '/api/v1/users/sign_in' do
      post 'creates new user session' do
        tags 'Sessions'
        consumes 'application/json'
        parameter name: :params, in: :body, schema: {
          type: :object,
          properties: {
            email: { type: :string },
            password: { type: :string },
          }
        }

        response(200, 'logins new user successfully') do
          let(:params) do
            {
              user: {
                email: 'sample@email.com',
                password: '12345678',
              }
            }
          end

          before do
            create(:user, email: 'sample@email.com', password: '12345678')
          end

          run_test! do |response|
            expect(response).to have_http_status :ok
            expect(json_response).to include(
              status: include(code: 200, message: 'Logged in successfully.'),
              data: include(
                user: include(email: 'sample@email.com')
              )
            )
          end
        end
      end
    end
  end

  describe '#destroy' do # rubocop:disable RSpec/EmptyExampleGroup
    path '/api/v1/users/sign_out' do
      delete 'logs out user' do
        tags 'Sessions'
        consumes 'application/json'

        response(200, 'logouts new user successfully') do
          let(:user) do
            create(
              :user,
              email: 'test@email.com',
              password: 'password',
              password_confirmation: 'password'
            )
          end

          before do
            sign_in user
          end

          run_test! do |response|
            expect(response).to have_http_status :ok
            expect(json_response).to include(
              status: include(code: 200, message: 'Logged out successfully.')
            )
          end
        end
      end
    end
  end

  describe '#validate_token' do # rubocop:disable RSpec/EmptyExampleGroup
    path '/api/v1/users/validate_token' do
      get 'validates user token' do
        tags 'Sessions'
        consumes 'application/json'

        response(200, 'validates user token') do
          let(:user) do
            create(
              :user,
              email: 'test@email.com',
              password: 'password',
              password_confirmation: 'password'
            )
          end

          before do
            sign_in user
          end

          run_test! do |response|
            expect(response).to have_http_status :ok
          end
        end

        response(401, 'validates user token if it doesn not exist') do
          run_test! do |response|
            expect(response).to have_http_status :unauthorized
          end
        end
      end
    end
  end
end
