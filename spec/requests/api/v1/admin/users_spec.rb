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
      sign_in create(:user, :staff)
      get '/api/v1/admin/users'
      expect(response).to have_http_status(:forbidden)
    end
  end

  context 'as an admin' do
    before { sign_in create(:user, :admin) }

    describe 'GET /api/v1/admin/users' do
      it 'lists accounts and filters by office' do
        create(:user, :staff, email: 'registry@baras.gov', office: 'certifications')
        create(:user, :other_desk_staff, email: 'field@baras.gov', office: 'disaster_management')

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
      it 'creates an account with an assigned role and desk' do
        expect do
          post '/api/v1/admin/users', params: {
            user: {
              email: 'new.staff@baras.gov', password: 'password123',
              role: 'staff', office: 'disaster_management'
            }
          }
        end.to change(User, :count).by(1)

        expect(response).to have_http_status(:created)
        expect(json.dig(:data, :user, :role)).to eq('staff')
        expect(json.dig(:data, :user, :office)).to eq('disaster_management')
        # BRGY-136: the column is gone, so the admin view must not carry it.
        expect(json.dig(:data, :user)).not_to have_key(:barangay)
      end

      it 'ignores a barangay parameter rather than failing on it' do
        # An old client (or a stale bookmark) can still send it. Strong params
        # drop it silently; this pins that it does not 500 instead.
        post '/api/v1/admin/users', params: {
          user: {
            email: 'legacy.client@baras.gov', password: 'password123',
            role: 'staff', office: 'treasury', barangay: 'Barangay Uno'
          }
        }

        expect(response).to have_http_status(:created)
      end

      it 'returns 422 for invalid input' do
        post '/api/v1/admin/users', params: { user: { email: 'bad', password: 'x' } }
        expect(response).to have_http_status(:unprocessable_entity)
      end
    end

    describe 'PATCH /api/v1/admin/users/:id' do
      it 'reassigns role and office' do
        user = create(:user, :staff, office: 'certifications')

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

  # BRGY-127. One barangay, one deployment, one administrator and no IT
  # department — a lockout here is a phone call to a developer, not a ticket.
  # The guards live on the server so they hold whatever the UI does.
  describe 'lockout guards' do
    let(:admin) { create(:user, :admin, email: 'admin@barangay.gov.local') }

    before { sign_in admin }

    describe 'deactivating yourself' do
      it 'is refused even though the caller is an admin' do
        patch "/api/v1/admin/users/#{admin.id}/deactivate"

        expect(response).to have_http_status(:unprocessable_entity)
        expect(json.dig(:status, :message)).to eq(Api::V1::Admin::UsersController::SELF_DEACTIVATION)
        expect(admin.reload.active).to be(true)
      end

      it 'is refused even when a second administrator exists' do
        # Not a lockout — but it still ends the caller's own session, and
        # nobody else asked for that. Refused unconditionally.
        create(:user, :admin, email: 'second@barangay.gov.local')

        patch "/api/v1/admin/users/#{admin.id}/deactivate"

        expect(response).to have_http_status(:unprocessable_entity)
        expect(admin.reload.active).to be(true)
      end

      it 'is refused through PATCH too, not just the named endpoint' do
        # `update` permits :active, so guarding only #deactivate would leave
        # PATCH able to do by parameter what the guarded endpoint refuses.
        patch "/api/v1/admin/users/#{admin.id}", params: { user: { active: false } }

        expect(response).to have_http_status(:unprocessable_entity)
        expect(admin.reload.active).to be(true)
      end
    end

    describe 'demoting the last administrator' do
      it 'refuses self-demotion when no other admin can sign in' do
        patch "/api/v1/admin/users/#{admin.id}", params: { user: { role: 'staff' } }

        expect(response).to have_http_status(:unprocessable_entity)
        expect(json.dig(:status, :message)).to eq(Api::V1::Admin::UsersController::LAST_ADMIN_DEMOTION)
        expect(admin.reload.role).to eq('admin')
      end

      it 'allows self-demotion once a second administrator exists' do
        create(:user, :admin, email: 'second@barangay.gov.local')

        patch "/api/v1/admin/users/#{admin.id}", params: { user: { role: 'staff' } }

        expect(response).to have_http_status(:ok)
        expect(admin.reload.role).to eq('staff')
      end

      it 'does not count a deactivated admin as a second administrator' do
        # A deactivated admin cannot sign in, so it is no help to anybody
        # locked out. The scope filters on `active` for exactly this case.
        create(:user, :admin, email: 'retired@barangay.gov.local', active: false)

        patch "/api/v1/admin/users/#{admin.id}", params: { user: { role: 'staff' } }

        expect(response).to have_http_status(:unprocessable_entity)
        expect(admin.reload.role).to eq('admin')
      end
    end

    describe 'changes that are none of the guard\'s business' do
      it 'still allows editing somebody else' do
        other = create(:user, :staff)

        patch "/api/v1/admin/users/#{other.id}", params: { user: { role: 'department_head' } }

        expect(response).to have_http_status(:ok)
        expect(other.reload.role).to eq('department_head')
      end

      it 'still allows deactivating somebody else' do
        other = create(:user, :staff)

        patch "/api/v1/admin/users/#{other.id}/deactivate"

        expect(response).to have_http_status(:ok)
        expect(other.reload.active).to be(false)
      end

      it 'does not mistake a no-op for a change' do
        # `active: true` on an already-active sole admin changes nothing, so
        # the guard must reason about the resulting state rather than the
        # presence of the parameter.
        patch "/api/v1/admin/users/#{admin.id}", params: { user: { active: true, office: 'treasury' } }

        expect(response).to have_http_status(:ok)
        expect(admin.reload.office).to eq('treasury')
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
