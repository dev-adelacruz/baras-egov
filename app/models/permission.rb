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
  # Functional modules, aligned with the LGU offices in the PRD.
  MODULES = %w[
    civil_registry
    treasury
    business_permits
    social_welfare
    disaster_management
    health
    documents
    reports
    user_management
  ].freeze

  ACTIONS = %i[read write delete manage].freeze

  FULL_ACCESS = %i[read write delete manage].freeze
  MANAGE_ACCESS = %i[read write manage].freeze
  WRITE_ACCESS = %i[read write].freeze
  READ_ACCESS = %i[read].freeze

  module_function

  # The permission map for a user: { "civil_registry" => [:read, :write], ... }.
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
