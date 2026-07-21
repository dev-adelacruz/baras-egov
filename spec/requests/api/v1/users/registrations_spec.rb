# frozen_string_literal: true

require 'swagger_helper'

RSpec.describe 'Registrations' do
  let(:json_response) { JSON.parse(response.body, symbolize_names: true) }

  describe '#create' do # rubocop:disable RSpec/EmptyExampleGroup
    path '/api/v1/users' do
      post 'registers new users' do
        tags 'Registrations'
        consumes 'application/json'
        parameter name: :params, in: :body, schema: {
          type: :object,
          properties: {
            email: { type: :string },
            password: { type: :string },
            password_confirmation: { type: :string },
          }
        }

        response(200, 'register new user successfully') do
          let(:params) do
            {
              user: {
                email: 'sample@email.com',
                password: '12345678',
                password_confirmation: '12345678'
              }
            }
          end

          run_test! do |response|
            expect(response).to have_http_status :ok
            expect(json_response).to include(
              data: include(email: 'sample@email.com'),
              status: include(code: 200, message: 'Signed up successfully.')
            )
          end
        end

        response(422, 'registration failed because email is malformed') do
          let(:params) do
            {
              user: {
                email: 'sample.com',
                password: '12345678',
                password_confirmation: '12345678'
              }
            }
          end

          run_test! do |response|
            expect(response).to have_http_status :unprocessable_entity
            expect(json_response).to include(
              status: include(code: 422, message: "User couldn't be created successfully. Email is invalid")
            )
          end
        end

        response(422, 'registration failed because passwords do not match') do
          let(:params) do
            {
              user: {
                email: 'sample@email.com',
                password: '12345678',
                password_confirmation: '123456789'
              }
            }
          end

          run_test! do |response|
            expect(response).to have_http_status :unprocessable_entity
            expect(json_response).to include(
              status: include(code: 422, message: "User couldn't be created successfully. Password confirmation doesn't match Password")
            )
          end
        end

        response(422, 'registration failed because user already exists') do
          let(:params) do
            {
              user: {
                email: 'sample@email.com',
                password: '12345678',
                password_confirmation: '12345678'
              }
            }
          end

          before do
            create(:user, email: 'sample@email.com', password: '12345678', password_confirmation: '12345678')
          end

          run_test! do |response|
            expect(response).to have_http_status :unprocessable_entity
            expect(json_response).to include(
              status: include(code: 422, message: "User couldn't be created successfully. Email has already been taken")
            )
          end
        end
      end
    end
  end
end
