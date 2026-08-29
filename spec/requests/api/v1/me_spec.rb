# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::Me', type: :request do
  let(:json) { JSON.parse(response.body, symbolize_names: true) }

  it 'requires authentication' do
    get '/api/v1/me'
    expect(response).to have_http_status(:unauthorized)
  end

  context 'as an admin' do
    before { sign_in create(:user, :admin) }

    it 'returns full permissions across every module' do
      get '/api/v1/me'

      expect(response).to have_http_status(:ok)
      perms = json.dig(:data, :user, :permissions)
      expect(perms.keys).to match_array(Permission::MODULES.map(&:to_sym))
      expect(perms[:user_management]).to match_array(%w[read write delete manage])
    end
  end

  context 'as staff' do
    before { sign_in create(:user, :staff, office: 'certifications') }

    it 'returns write on its own office and read on the shared registers' do
      get '/api/v1/me'

      perms = json.dig(:data, :user, :permissions)
      expect(perms.keys).to match_array(%i[certifications residents])
      expect(perms[:certifications]).to match_array(%w[read write])
      expect(perms[:residents]).to eq(%w[read])
    end
  end

  # BRGY-136 removed the barangay-scoped payload entirely. This replaces the
  # spec that asserted its shape: the frontend branched on `data_scope`, so a
  # field that quietly reappeared would put that branching back into service.
  context 'payload shape after the single-tenant strip' do
    before { sign_in create(:user, :staff, office: 'treasury') }

    it 'emits neither data_scope nor barangay' do
      get '/api/v1/me'

      user = json.dig(:data, :user)
      expect(user).not_to have_key(:data_scope)
      expect(user).not_to have_key(:barangay)
      expect(user[:role]).to eq('staff')
    end
  end
end
