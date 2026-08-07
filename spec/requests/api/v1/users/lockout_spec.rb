# frozen_string_literal: true

require 'rails_helper'

# Failed-login lockout: after Devise.maximum_attempts consecutive failures the
# account is locked and even a correct password is rejected until it unlocks.
RSpec.describe 'Failed-login lockout', type: :request do
  let(:password) { 'password123' }
  let!(:user) { create(:user, email: 'lock@test.com', password: password) }

  def sign_in_with(pw)
    post '/api/v1/users/sign_in', params: { user: { email: 'lock@test.com', password: pw } }
  end

  it 'locks the account after the maximum number of failed attempts' do
    Devise.maximum_attempts.times { sign_in_with('wrong-password') }

    expect(user.reload.access_locked?).to be(true)
  end

  it 'rejects a correct password once the account is locked' do
    Devise.maximum_attempts.times { sign_in_with('wrong-password') }

    sign_in_with(password)
    expect(response).to have_http_status(:unauthorized)
    expect(response.headers['Authorization']).to be_nil
  end

  it 'does not lock the account before the threshold is reached' do
    (Devise.maximum_attempts - 1).times { sign_in_with('wrong-password') }

    expect(user.reload.access_locked?).to be(false)

    sign_in_with(password)
    expect(response).to have_http_status(:ok)
  end
end
