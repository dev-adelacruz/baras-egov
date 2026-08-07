# frozen_string_literal: true

namespace :v1 do
  draw(:devise)

  get 'me', to: 'me#show'
end
