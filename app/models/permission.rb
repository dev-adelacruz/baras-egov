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
  # The barangay's functional desks.
  #
  # This list was previously an LGU *municipal* org chart — civil_registry,
  # business_permits, a full health unit. A barangay runs none of those: birth,
  # death and marriage registration is the Municipal Civil Registrar's, mayor's
  # permits are the BPLO's, and the Rural Health Unit is municipal. BRGY-137
  # re-derived it from what a barangay is mandated to do under RA 7160, and
  # BRGY-142 then checked that derivation against how the hall actually runs.
  #
  # A module is a *desk a person is assigned to*, not a document type. A user
  # holds exactly one, so two modules mean two people. That is why certifications
  # and clearances are one entry: §394 makes the barangay secretary custodian of
  # all barangay records, and she prepares both — a residency certificate and a
  # barangay clearance travel the same route to the same signature. Business
  # clearance (§152(c)) adds a fee and a seven-working-day clock, which are
  # fields on a document, not a second desk.
  #
  # Changing this constant changes authorization server-side, the /api/v1/me
  # payload, and the office a staff account can be assigned to. Keep it in sync
  # with OFFICE_MODULES in app/frontend/services/adminUserService.ts.
  MODULES = %w[
    residents
    certifications
    katarungan
    treasury
    social_services
    disaster_management
    legislative
    reports
    user_management
  ].freeze

  # Modules every provisioned staff account may read regardless of its own desk.
  #
  # The Record of Barangay Inhabitants (§394(d)) is not a desk's private file —
  # it is the substrate every desk works from. A treasurer collecting a fee and a
  # Lupon secretary docketing a complaint are both looking up the same resident.
  # Confining it to one office the way every other module is confined would make
  # the other desks unable to do their own work.
  #
  # Read only. Writing the register stays with the desk that owns it, and DILG
  # requires the register be access-controlled — so this widens reading inside
  # the system, never outside it.
  SHARED_READ_MODULES = %w[residents].freeze

  # Retired modules and the desk that absorbed each one, kept so the data
  # migration and any straggling record can be recognised rather than silently
  # failing validation. Never grant permissions against these.
  #
  # `health` is deliberately absent. It was a module until BRGY-142 and has no
  # successor desk: a Barangay Health Station is a subunit of the RHU, its
  # records are the DOH's prescribed FHSIS forms, and the midwife who keeps them
  # reports to the municipal RHU rather than to the barangay. An account found on
  # `health` is therefore cleared to nil by the migration and reassigned by hand
  # — there is no desk to send it to, and guessing one would be worse.
  RETIRED_MODULES = {
    'civil_registry' => 'certifications',   # registration is municipal; the barangay attests
    'business_permits' => 'certifications', # barangay issues the clearance, not the permit
    'social_welfare' => 'social_services',  # renamed
    'documents' => 'certifications',        # never split; one secretary keeps all of it
    'clearances' => 'certifications'        # same desk, same signature, same records
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

  # Staff act on their assigned office module, and read the shared registers.
  #
  # An account with no valid office is unprovisioned, not merely deskless — it
  # gets nothing, including the shared registers. The resident register is
  # access-controlled by DILG mandate, so an account nobody has finished setting
  # up is the wrong thing to hand it to.
  def office_permissions(user, actions)
    return {} unless module?(user.office)

    permissions = SHARED_READ_MODULES.index_with { READ_ACCESS.dup }
    # Assigned last on purpose: staff whose own desk *is* a shared register get
    # their write access, not the read they would otherwise be narrowed to.
    permissions[user.office] = actions.dup
    permissions
  end

  def module?(mod)
    MODULES.include?(mod)
  end
end
