# frozen_string_literal: true

devise_for :users, singular: :user, controllers: {
  registrations: 'api/v1/users/registrations',
  sessions: 'api/v1/users/sessions'
}

# Add custom route for token validation
devise_scope :user do
  get 'users/validate_token', to: 'users/sessions#validate_token'
end
