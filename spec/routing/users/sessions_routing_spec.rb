# frozen_string_literal: true

require 'rails_helper'

RSpec.describe 'Sessions Routing' do
  describe '#new' do
    subject { get('/api/v1/users/sign_in') }

    it { is_expected.to route_to(controller: 'api/v1/users/sessions', action: 'new') }
  end

  describe '#create' do
    subject { post('/api/v1/users/sign_in') }

    it { is_expected.to route_to(controller: 'api/v1/users/sessions', action: 'create') }
  end

  describe '#destroy' do
    subject { delete('/api/v1/users/sign_out') }

    it { is_expected.to route_to(controller: 'api/v1/users/sessions', action: 'destroy') }
  end

  describe '#validate_token' do
    subject { get('/api/v1/users/validate_token') }

    it { is_expected.to route_to(controller: 'api/v1/users/sessions', action: 'validate_token') }
  end
end
