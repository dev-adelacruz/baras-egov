# frozen_string_literal: true

FactoryBot.define do
  factory :user do
    email { Faker::Internet.email }
    password { SecureRandom.hex }
    role { :municipal_staff }
    office { 'certifications' }

    trait :admin do
      role { :admin }
      office { nil }
    end

    trait :department_head do
      role { :department_head }
      office { 'certifications' }
    end

    trait :municipal_staff do
      role { :municipal_staff }
      office { 'certifications' }
    end

    trait :barangay_staff do
      role { :barangay_staff }
      office { 'disaster_management' }
      barangay { 'Barangay San Isidro' }
    end
  end
end
