# frozen_string_literal: true

Rails.application.routes.draw do
  mount Rswag::Api::Engine => '/api-docs'
  mount Rswag::Ui::Engine => '/api-docs'
  draw(:api)

  get 'up' => 'rails/health#show', as: :rails_health_check

  get '/*anyPath', to: 'root#index', anyPath: /(?!api).*/
end
