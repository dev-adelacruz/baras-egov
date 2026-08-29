# frozen_string_literal: true

# BRGY-137. `Permission::MODULES` was a municipal org chart; it is now the
# barangay's own desks. Accounts still holding a retired office have to move
# with it.
#
# This is not cosmetic. `User` validates `office` with
# `inclusion: { in: Permission::MODULES }`, and inclusion runs on write, not on
# read. Left alone, an account holding `civil_registry` keeps loading fine and
# then silently fails to save — so deactivating that colleague, or changing
# their role, just stops working for a reason that looks nothing like the cause.
class RemapRetiredOfficeModules < ActiveRecord::Migration[7.1]
  def up
    Permission::RETIRED_MODULES.each do |old_office, new_office|
      count = User.where(office: old_office).update_all(office: new_office)
      say "remapped #{count} user(s): #{old_office} -> #{new_office}" if count.positive?
    end

    # Anything left is an office that was never in MODULES to begin with — bad
    # data, not a rename. Null it rather than guess: a nil office is valid
    # (allow_nil) and shows up as "—" in the accounts table, which is a visible
    # prompt to reassign. Silently picking a desk for someone would be worse.
    orphaned = User.where.not(office: Permission::MODULES).where.not(office: nil)
    if orphaned.exists?
      say "clearing #{orphaned.count} user(s) with an unrecognised office: " \
          "#{orphaned.distinct.pluck(:office).sort.join(', ')}"
      orphaned.update_all(office: nil)
    end
  end

  # Deliberately irreversible. The mapping is many-to-one — both
  # `business_permits` and `documents` collapse into modules that also receive
  # other values — so rolling back cannot know which accounts came from where,
  # and the retired offices would fail validation on the way back anyway.
  def down
    raise ActiveRecord::IrreversibleMigration,
          'Office modules were remapped many-to-one in BRGY-137; restore from backup instead.'
  end
end
