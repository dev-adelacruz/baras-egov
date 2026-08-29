# frozen_string_literal: true

FactoryBot.define do
  factory :user do
    email { Faker::Internet.email }
    password { SecureRandom.hex }
    role { :staff }
    office { 'certifications' }

    trait :admin do
      role { :admin }
      office { nil }
    end

    trait :department_head do
      role { :department_head }
      office { 'certifications' }
    end

    trait :staff do
      role { :staff }
      office { 'certifications' }
    end

    # A second desk, for specs that need two staff accounts that are not
    # interchangeable. Replaces the old :barangay_staff trait, which existed to
    # exercise a scoping split that BRGY-136 removed.
    trait :other_desk_staff do
      role { :staff }
      office { 'disaster_management' }
    end
  end
end
