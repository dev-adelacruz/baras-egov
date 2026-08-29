# frozen_string_literal: true

# Central authorization policy for the platform.
#
# Roles and the modules they may act on are defined here so that both the
# server-side guards (see Authorizable) and the /api/v1/me payload consumed by
# the frontend derive access from a single source of truth.
#
# A user's permissions are the map { module => [actions] } returned by
# `Permission.for(user)`. Actions are: :read, :write, :delete, :manage.
module Permission
  # The barangay's functional desks (BRGY-137).
  #
  # This list was previously an LGU *municipal* org chart — civil_registry,
  # business_permits, a full health unit. A barangay runs none of those: birth,
  # death and marriage registration is the Municipal Civil Registrar's, mayor's
  # permits are the BPLO's, and the Rural Health Unit is municipal. The product
  # serves one barangay per deployment, so the list is re-derived from what a
  # barangay is actually mandated to do under RA 7160.
  #
  # Changing this constant changes authorization server-side, the /api/v1/me
  # payload, and the office a staff account can be assigned to. Keep it in sync
  # with OFFICE_MODULES in app/frontend/services/adminUserService.ts.
  MODULES = %w[
    residents
    certifications
    clearances
    katarungan
    treasury
    social_services
    health
    disaster_management
    legislative
    reports
    user_management
  ].freeze

  # Retired in BRGY-137, kept only so the data migration and any straggling
  # record can be recognised rather than silently failing validation. Never
  # grant permissions against these.
  RETIRED_MODULES = {
    'civil_registry' => 'certifications',   # registration is municipal; the barangay attests
    'business_permits' => 'clearances',     # barangay issues the clearance, not the permit
    'social_welfare' => 'social_services',  # renamed
    'documents' => 'certifications'         # split into certifications + clearances
  }.freeze

  ACTIONS = %i[read write delete manage].freeze

  FULL_ACCESS = %i[read write delete manage].freeze
  MANAGE_ACCESS = %i[read write manage].freeze
  WRITE_ACCESS = %i[read write].freeze
  READ_ACCESS = %i[read].freeze

  module_function

  # The permission map for a user: { "certifications" => [:read, :write], ... }.
  # Modules the user cannot touch are omitted entirely.
  def for(user)
    case user.role.to_sym
    when :admin            then admin_permissions
    when :department_head  then department_head_permissions(user)
    when :municipal_staff  then office_permissions(user, WRITE_ACCESS)
    when :barangay_staff   then office_permissions(user, WRITE_ACCESS)
    else {}
    end
  end

  # Whether a user may perform `action` on `mod`.
  def permits?(user, mod, action)
    Array(self.for(user)[mod.to_s]).include?(action.to_sym)
  end

  # Admins act on every module, unrestricted.
  def admin_permissions
    MODULES.index_with { FULL_ACCESS.dup }
  end

  # Department heads manage their own office, can read every other module for
  # oversight, and always see reports. They never touch user_management.
  def department_head_permissions(user)
    permissions = MODULES.each_with_object({}) do |mod, acc|
      acc[mod] = READ_ACCESS.dup unless mod == 'user_management'
    end
    permissions[user.office] = MANAGE_ACCESS.dup if module?(user.office)
    permissions['reports'] = READ_ACCESS.dup
    permissions
  end

  # Staff act only on their assigned office module.
  def office_permissions(user, actions)
    return {} unless module?(user.office)

    { user.office => actions.dup }
  end

  def module?(mod)
    MODULES.include?(mod)
  end
end
