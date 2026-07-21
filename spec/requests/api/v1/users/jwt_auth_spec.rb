# frozen_string_literal: true

require 'rails_helper'

# Behavioural coverage for the JWT auth lifecycle: token dispatch on login,
# revocation on logout, expiry, and rejection of missing/malformed tokens.
RSpec.describe 'JWT auth lifecycle', type: :request do
  include ActiveSupport::Testing::TimeHelpers

  let(:json) { JSON.parse(response.body, symbolize_names: true) }
  let(:password) { 'password123' }
  let!(:user) { create(:user, email: 'jwt@test.com', password: password) }

  def sign_in_and_get_token(pw = password)
    post '/api/v1/users/sign_in', params: { user: { email: 'jwt@test.com', password: pw } }
    response.headers['Authorization']
  end

  describe 'login token dispatch' do
    it 'returns a JWT in the Authorization header on success' do
      token = sign_in_and_get_token
      expect(response).to have_http_status(:ok)
      expect(token).to match(%r{\ABearer .+\..+\..+\z})
      expect(json.dig(:data, :user, :email)).to eq('jwt@test.com')
    end

    it 'rejects a wrong password and issues no token' do
      post '/api/v1/users/sign_in', params: { user: { email: 'jwt@test.com', password: 'wrong-password' } }
      expect(response).to have_http_status(:unauthorized)
      expect(response.headers['Authorization']).to be_nil
    end

    it 'rejects a non-existent user' do
      post '/api/v1/users/sign_in', params: { user: { email: 'nobody@test.com', password: password } }
      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe 'validate_token' do
    it 'accepts a freshly issued token' do
      token = sign_in_and_get_token
      get '/api/v1/users/validate_token', headers: { 'Authorization' => token }
      expect(response).to have_http_status(:ok)
      expect(json.dig(:data, :user, :email)).to eq('jwt@test.com')
    end

    it 'rejects a request with no token' do
      get '/api/v1/users/validate_token'
      expect(response).to have_http_status(:unauthorized)
    end

    it 'rejects a malformed token' do
      get '/api/v1/users/validate_token', headers: { 'Authorization' => 'Bearer not.a.valid.jwt' }
      expect(response).to have_http_status(:unauthorized)
    end

    it 'rejects an expired token' do
      # Mint a token in the past (no HTTP login, so no session cookie masks the
      # JWT check) — its exp is now behind us. Only expiry can cause the 401.
      token = nil
      travel_to(2.hours.ago) do
        token, = Warden::JWTAuth::UserEncoder.new.call(user, :user, nil)
      end
      get '/api/v1/users/validate_token', headers: { 'Authorization' => "Bearer #{token}" }
      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe 'logout token revocation' do
    it 'revokes the token so it can no longer authenticate' do
      token = sign_in_and_get_token

      get '/api/v1/users/validate_token', headers: { 'Authorization' => token }
      expect(response).to have_http_status(:ok)

      delete '/api/v1/users/sign_out', headers: { 'Authorization' => token }
      expect(response).to have_http_status(:ok)

      get '/api/v1/users/validate_token', headers: { 'Authorization' => token }
      expect(response).to have_http_status(:unauthorized)
    end
  end
end
