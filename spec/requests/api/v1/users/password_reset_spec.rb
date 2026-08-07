# frozen_string_literal: true

require 'rails_helper'

# Password reset flow: request instructions (enumeration-safe) and complete the
# reset with the emailed token, after which the new password authenticates.
RSpec.describe 'Password reset', type: :request do
  let(:json) { JSON.parse(response.body, symbolize_names: true) }
  let(:old_password) { 'old-password' }
  let(:new_password) { 'new-password' }
  let!(:user) { create(:user, email: 'reset@test.com', password: old_password) }

  describe 'requesting reset instructions' do
    it 'sets a reset token and returns a generic 200 for a known email' do
      post '/api/v1/users/password', params: { user: { email: 'reset@test.com' } }

      expect(response).to have_http_status(:ok)
      expect(user.reload.reset_password_token).to be_present
      expect(json.dig(:status, :code)).to eq(200)
    end

    it 'returns the same generic 200 for an unknown email (no enumeration)' do
      post '/api/v1/users/password', params: { user: { email: 'nobody@test.com' } }

      expect(response).to have_http_status(:ok)
    end
  end

  describe 'completing the reset' do
    it 'changes the password with a valid token and lets the new one log in' do
      raw_token = user.send_reset_password_instructions

      put '/api/v1/users/password', params: {
        user: { reset_password_token: raw_token, password: new_password, password_confirmation: new_password }
      }
      expect(response).to have_http_status(:ok)

      post '/api/v1/users/sign_in', params: { user: { email: 'reset@test.com', password: new_password } }
      expect(response).to have_http_status(:ok)
      expect(response.headers['Authorization']).to be_present
    end

    it 'rejects an invalid token' do
      put '/api/v1/users/password', params: {
        user: { reset_password_token: 'not-a-real-token', password: new_password, password_confirmation: new_password }
      }

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it 'rejects mismatched password confirmation' do
      raw_token = user.send_reset_password_instructions

      put '/api/v1/users/password', params: {
        user: { reset_password_token: raw_token, password: new_password, password_confirmation: 'different' }
      }

      expect(response).to have_http_status(:unprocessable_entity)
    end
  end
end
