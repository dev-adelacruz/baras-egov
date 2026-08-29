# frozen_string_literal: true

# Seeds are idempotent — re-running `bin/rails db:seed` will not create
# duplicates. User seeding is limited to local environments (development/test)
# so dev credentials never land in production.
#
# BRGY-137: this used to seed a municipal org chart — a civil registry desk, a
# treasury clerk and a field officer scoped to "Barangay San Isidro". That last
# one only makes sense if the deployment holds several barangays. It holds one.
# The accounts below are the desks of a single barangay hall.
if Rails.env.local?
  dev_password = ENV.fetch('SEED_PASSWORD', 'password123')

  # Retired in BRGY-137. Removed rather than remapped: these were never real
  # people, and leaving them would keep the municipal shape alive in every
  # developer's database and in every screenshot taken from one.
  # Every account from the municipal seed set, including the old admin — it is
  # not superseded by admin@barangay.gov.local, it simply co-exists with it, and
  # a second full administrator with a published dev password is not something
  # to leave lying in every developer's database.
  #
  # bhw@ joins them in BRGY-142. It sat at a `health` desk that no longer
  # exists — a Barangay Health Station reports to the municipal RHU and keeps
  # the DOH's FHSIS records, so there is no barangay desk to move it to.
  retired_emails = %w[
    admin@baras.gov.local
    civil.head@baras.gov.local
    civil.clerk@baras.gov.local
    treasury.clerk@baras.gov.local
    field.sanisidro@baras.gov.local
    inactive@baras.gov.local
    bhw@barangay.gov.local
  ]

  seed_users = [
    { email: 'admin@barangay.gov.local',        role: :admin,           office: nil,               active: true },
    # The Punong Barangay is not an IT admin — they hold the barangay's
    # authority, not the system's. Seeded as a department head over the
    # documents desk so the two are not conflated during development.
    { email: 'captain@barangay.gov.local',      role: :department_head, office: 'certifications',  active: true },
    { email: 'secretary@barangay.gov.local',    role: :staff, office: 'certifications',  active: true },
    # The RBI encoder. `residents` is readable by every provisioned account but
    # writable only from this desk, so one seed has to sit here or nothing in
    # development can actually maintain the register.
    { email: 'records@barangay.gov.local',      role: :staff, office: 'residents',       active: true },
    { email: 'treasurer@barangay.gov.local',    role: :staff, office: 'treasury',        active: true },
    { email: 'lupon@barangay.gov.local',        role: :staff, office: 'katarungan',      active: true },
    { email: 'social@barangay.gov.local',       role: :staff, office: 'social_services', active: true },
    # Kept deactivated on purpose: /admin/users has an Active/Deactivated
    # column and a reactivate action, and neither is exercisable without one.
    { email: 'former.staff@barangay.gov.local', role: :staff, office: 'certifications',  active: false }
  ]

  removed = User.where(email: retired_emails).destroy_all.size
  puts "Removed #{removed} retired municipal seed account(s)." if removed.positive?

  seed_users.each do |attrs|
    user = User.find_or_initialize_by(email: attrs[:email])
    user.assign_attributes(attrs.except(:email))
    # Only set the password on creation so re-runs don't churn existing records.
    user.password = dev_password if user.new_record?
    user.save!
  end

  puts "Seeded #{seed_users.size} users (password: #{dev_password}):"
  User.where(email: seed_users.map { |u| u[:email] }).order(:email).each do |u|
    puts format('  %-36s role=%-16s office=%-16s active=%s',
                u.email, u.role, u.office || '-', u.active)
  end
else
  puts "Skipping user seeds outside development/test (Rails.env=#{Rails.env})."
end
