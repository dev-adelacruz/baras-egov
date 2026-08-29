# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Api::V1::Admin::Users', type: :request do
  let(:json) { JSON.parse(response.body, symbolize_names: true) }

  describe 'authorization' do
    it 'rejects unauthenticated requests with 401' do
      get '/api/v1/admin/users'
      expect(response).to have_http_status(:unauthorized)
    end

    it 'forbids non-admins with 403' do
      sign_in create(:user, :municipal_staff)
      get '/api/v1/admin/users'
      expect(response).to have_http_status(:forbidden)
    end
  end

  context 'as an admin' do
    before { sign_in create(:user, :admin) }

    describe 'GET /api/v1/admin/users' do
      it 'lists accounts and filters by office and barangay' do
        create(:user, :municipal_staff, email: 'registry@baras.gov', office: 'certifications')
        create(:user, :barangay_staff, email: 'field@baras.gov', office: 'disaster_management', barangay: 'Barangay Uno')

        get '/api/v1/admin/users', params: { office: 'disaster_management' }

        emails = json.dig(:data, :users).map { |u| u[:email] }
        expect(emails).to include('field@baras.gov')
        expect(emails).not_to include('registry@baras.gov')
      end

      it 'searches by email' do
        create(:user, email: 'findme@baras.gov')
        get '/api/v1/admin/users', params: { search: 'findme' }
        expect(json.dig(:data, :users).map { |u| u[:email] }).to include('findme@baras.gov')
      end
    end

    describe 'POST /api/v1/admin/users' do
      it 'creates an account with an assigned role and scope' do
        expect do
          post '/api/v1/admin/users', params: {
            user: {
              email: 'new.staff@baras.gov', password: 'password123',
              role: 'barangay_staff', office: 'disaster_management', barangay: 'Barangay Dos'
            }
          }
        end.to change(User, :count).by(1)

        expect(response).to have_http_status(:created)
        expect(json.dig(:data, :user, :role)).to eq('barangay_staff')
        expect(json.dig(:data, :user, :barangay)).to eq('Barangay Dos')
      end

      it 'returns 422 for invalid input' do
        post '/api/v1/admin/users', params: { user: { email: 'bad', password: 'x' } }
        expect(response).to have_http_status(:unprocessable_entity)
      end
    end

    describe 'PATCH /api/v1/admin/users/:id' do
      it 'reassigns role and office' do
        user = create(:user, :municipal_staff, office: 'certifications')

        patch "/api/v1/admin/users/#{user.id}", params: { user: { role: 'department_head', office: 'treasury' } }

        expect(response).to have_http_status(:ok)
        expect(user.reload.role).to eq('department_head')
        expect(user.office).to eq('treasury')
      end
    end

    describe 'deactivation' do
      it 'deactivates an account' do
        user = create(:user, email: 'leaver@baras.gov', password: 'password123')

        patch "/api/v1/admin/users/#{user.id}/deactivate"
        expect(response).to have_http_status(:ok)
        expect(user.reload.active).to be(false)
      end

      it 'reactivates a disabled account' do
        user = create(:user, active: false)
        patch "/api/v1/admin/users/#{user.id}/activate"
        expect(user.reload.active).to be(true)
      end
    end
  end

  # Kept outside the signed-in admin context: an existing Warden session would
  # otherwise short-circuit authentication of a different user.
  describe 'authentication of a deactivated account' do
    it 'is rejected at sign in' do
      create(:user, email: 'gone@baras.gov', password: 'password123', active: false)

      post '/api/v1/users/sign_in', params: { user: { email: 'gone@baras.gov', password: 'password123' } }

      expect(response).to have_http_status(:unauthorized)
      expect(response.headers['Authorization']).to be_nil
    end
  end
end
