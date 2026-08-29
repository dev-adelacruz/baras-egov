# frozen_string_literal: true

require 'rails_helper'

# Exercises the server-side module guard through an anonymous controller that
# inherits the authenticated API base. Covers permit, deny (403) and logging.
RSpec.describe Authorizable, type: :controller do
  controller(Api::V1::BaseController) do
    def index
      authorize_module!(:certifications, :write)
      render json: { ok: true }
    end
  end

  before { routes.draw { get 'index' => 'api/v1/base#index' } }

  context 'when the user may act on the module' do
    before { sign_in create(:user, :staff, office: 'certifications') }

    it 'permits the action' do
      get :index
      expect(response).to have_http_status(:ok)
    end
  end

  context 'when the user may not act on the module' do
    before { sign_in create(:user, :staff, office: 'treasury') }

    it 'returns 403 and logs the denial' do
      expect(Rails.logger).to receive(:warn).with(/\[authorization\] denied/)

      get :index

      expect(response).to have_http_status(:forbidden)
      expect(JSON.parse(response.body).dig('status', 'code')).to eq(403)
    end
  end

  context 'when no user is authenticated' do
    it 'returns 401' do
      get :index
      expect(response).to have_http_status(:unauthorized)
    end
  end
end
