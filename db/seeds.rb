# frozen_string_literal: true

# Seeds are idempotent — re-running `bin/rails db:seed` will not create
# duplicates. User seeding is limited to local environments (development/test)
# so dev credentials never land in production.
if Rails.env.local?
  dev_password = ENV.fetch('SEED_PASSWORD', 'password123')

  seed_users = [
    { email: 'admin@baras.gov.local',            role: :admin,            office: nil,                  barangay: nil,                   active: true },
    { email: 'civil.head@baras.gov.local',       role: :department_head,  office: 'civil_registry',     barangay: nil,                   active: true },
    { email: 'civil.clerk@baras.gov.local',      role: :municipal_staff,  office: 'civil_registry',     barangay: nil,                   active: true },
    { email: 'treasury.clerk@baras.gov.local',   role: :municipal_staff,  office: 'treasury',           barangay: nil,                   active: true },
    { email: 'field.sanisidro@baras.gov.local',  role: :barangay_staff,   office: 'disaster_management', barangay: 'Barangay San Isidro', active: true },
    { email: 'inactive@baras.gov.local',         role: :municipal_staff,  office: 'treasury',           barangay: nil,                   active: false }
  ]

  seed_users.each do |attrs|
    user = User.find_or_initialize_by(email: attrs[:email])
    user.assign_attributes(attrs.except(:email))
    # Only set the password on creation so re-runs don't churn existing records.
    user.password = dev_password if user.new_record?
    user.save!
  end

  puts "Seeded #{seed_users.size} users (password: #{dev_password}):"
  User.where(email: seed_users.map { |u| u[:email] }).order(:email).each do |u|
    puts format('  %-32s role=%-16s office=%-18s barangay=%-20s active=%s',
                u.email, u.role, u.office || '-', u.barangay || '-', u.active)
  end
else
  puts "Skipping user seeds outside development/test (Rails.env=#{Rails.env})."
end
