# frozen_string_literal: true

namespace :barangay do
  # BRGY-127's break-glass. The guards in Api::V1::Admin::UsersController should
  # make an admin lockout unreachable, but "should" is doing a lot of work in a
  # deployment with one administrator and no operator to fall back on. This is
  # the documented way back in when something else produces the same state — a
  # bad restore, a direct SQL edit, an account deleted rather than deactivated.
  #
  #   bin/rails "barangay:promote_admin[secretary@barangay.gov.local]"
  #
  # Deliberately not idempotent-silent: it prints what it changed, because the
  # person running it is usually on a phone call trying to explain the problem.
  desc 'Break-glass: make an account an active administrator (BRGY-127)'
  task :promote_admin, [:email] => :environment do |_task, args|
    email = args[:email].to_s.strip

    if email.empty?
      abort 'Usage: bin/rails "barangay:promote_admin[someone@barangay.gov.local]"'
    end

    user = User.find_by(email: email)
    abort "No account with email #{email}." if user.nil?

    was = "role=#{user.role} active=#{user.active}"
    user.role = :admin
    user.active = true

    if user.save
      puts "Promoted #{user.email}: #{was} -> role=admin active=true"
      puts "Active administrators now: #{User.active_admins.count}"
    else
      abort "Could not promote #{user.email}: #{user.errors.full_messages.to_sentence}"
    end
  end

  desc 'List administrators who can still sign in (BRGY-127)'
  task admins: :environment do
    admins = User.active_admins.order(:email)

    if admins.empty?
      puts 'No active administrators. Nobody can manage accounts — run barangay:promote_admin.'
    else
      puts "#{admins.count} active administrator(s):"
      admins.each { |u| puts "  #{u.email}" }
    end
  end
end
