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

    it 'returns full permissions across every module and an :all scope' do
      get '/api/v1/me'

      expect(response).to have_http_status(:ok)
      perms = json.dig(:data, :user, :permissions)
      expect(perms.keys).to match_array(Permission::MODULES.map(&:to_sym))
      expect(perms[:user_management]).to match_array(%w[read write delete manage])
      expect(json.dig(:data, :user, :data_scope)).to eq('all')
    end
  end

  context 'as municipal staff' do
    before { sign_in create(:user, :municipal_staff, office: 'certifications') }

    it 'returns write access to its office module only' do
      get '/api/v1/me'

      perms = json.dig(:data, :user, :permissions)
      expect(perms.keys).to eq([:certifications])
      expect(perms[:certifications]).to match_array(%w[read write])
    end
  end

  context 'as barangay staff' do
    before { sign_in create(:user, :barangay_staff, barangay: 'Barangay San Isidro') }

    it 'reports a barangay-scoped data scope and role' do
      get '/api/v1/me'

      expect(json.dig(:data, :user, :role)).to eq('barangay_staff')
      expect(json.dig(:data, :user, :data_scope)).to eq(barangay: 'Barangay San Isidro')
    end
  end
end
