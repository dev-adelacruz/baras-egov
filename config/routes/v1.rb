# frozen_string_literal: true

namespace :v1 do
  draw(:devise)

  get 'me', to: 'me#show'

  namespace :admin do
    resources :users, only: %i[index create update] do
      member do
        patch :deactivate
        patch :activate
      end
    end
  end
end
