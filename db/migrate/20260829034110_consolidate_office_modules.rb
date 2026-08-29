# frozen_string_literal: true

# BRGY-142. `clearances` and `health` stop being desks; accounts sitting on them
# have to move before they become unsaveable.
#
# Same hazard as BRGY-137's migration: `User` validates `office` with
# `inclusion: { in: Permission::MODULES }`, and inclusion runs on write, not on
# read. An account left on a retired office keeps loading fine and then silently
# fails to save — so deactivating that colleague, or changing their role, just
# stops working for a reason that looks nothing like the cause.
class ConsolidateOfficeModules < ActiveRecord::Migration[7.1]
  # A migration is a historical record. It has to keep doing what it did on the
  # day it was written even after the constants it was derived from have moved
  # on — so the values below are spelled out rather than read from
  # `Permission::MODULES`. BRGY-137's migration read the constants, which means
  # editing them in this ticket retroactively changed what that migration does.
  # Harmless here (it now remaps to the same place this one does), but the
  # coupling is the defect, not the outcome.
  REMAPPED = {
    'clearances' => 'certifications' # one secretary keeps both; §394
  }.freeze

  # Retired with no successor desk. A Barangay Health Station is a subunit of
  # the RHU and its records are the DOH's FHSIS forms, so there is nowhere in a
  # barangay to send these accounts. Cleared to nil rather than guessed at.
  RETIRED_WITHOUT_SUCCESSOR = %w[health].freeze

  # The nine desks as of this migration.
  VALID_OFFICES = %w[
    residents certifications katarungan treasury social_services
    disaster_management legislative reports user_management
  ].freeze

  # Decoupled from app/models/user.rb for the same reason as the literals above.
  # `update_all` skips validations, which is required — the current value is
  # already invalid, so a normal save could not write it.
  class MigrationUser < ActiveRecord::Base
    self.table_name = 'users'
  end

  def up
    REMAPPED.each do |old_office, new_office|
      count = MigrationUser.where(office: old_office).update_all(office: new_office)
      say "remapped #{count} user(s): #{old_office} -> #{new_office}" if count.positive?
    end

    # Anything still outside the list is either a retired-without-successor
    # office or data that was never valid. Both get nil, which is a legal value
    # (allow_nil) and renders as "—" in the accounts table — a visible prompt to
    # reassign. Silently picking a desk for someone would be worse.
    orphaned = MigrationUser.where.not(office: VALID_OFFICES).where.not(office: nil)
    return unless orphaned.exists?

    say "clearing #{orphaned.count} user(s) with no successor desk: " \
        "#{orphaned.distinct.pluck(:office).sort.join(', ')} — reassign by hand"
    orphaned.update_all(office: nil)
  end

  # Deliberately irreversible. `clearances` merges into a module that already
  # holds other accounts, so rolling back cannot know which came from where, and
  # the offices cleared to nil have no recorded prior value at all.
  def down
    raise ActiveRecord::IrreversibleMigration,
          'Office modules were consolidated many-to-one in BRGY-142; restore from backup instead.'
  end
end
