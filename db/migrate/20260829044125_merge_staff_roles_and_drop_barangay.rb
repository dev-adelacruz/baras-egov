# frozen_string_literal: true

# BRGY-136. One barangay per deployment, so nothing needs to say *which* one.
#
# `barangay_staff` and `municipal_staff` existed as a pair so one could be
# scoped against the other. They already resolved to identical permissions —
# the only thing separating them was `barangay_scoped?`, which this ticket
# removes. Two names for one role, and "municipal" was the wrong word in a
# barangay product either way.
class MergeStaffRolesAndDropBarangay < ActiveRecord::Migration[7.1]
  # Spelled out rather than read from `User.roles`, for the reason BRGY-142's
  # migration documents: a migration has to keep doing what it did on the day it
  # was written, and the enum is being renamed in the same commit.
  BARANGAY_STAFF = 3
  STAFF = 2

  # Decoupled from app/models/user.rb — the enum no longer defines 3, so the
  # real model cannot even express the value this migration has to find.
  class MigrationUser < ActiveRecord::Base
    self.table_name = 'users'
  end

  def up
    count = MigrationUser.where(role: BARANGAY_STAFF).update_all(role: STAFF)
    say "merged #{count} barangay_staff account(s) into staff" if count.positive?

    # Reported before the column goes, because afterwards there is no way to
    # know this data existed at all.
    populated = MigrationUser.where.not(barangay: [nil, '']).count
    say "dropping barangay from #{populated} account(s) that had one set" if populated.positive?

    remove_index :users, :barangay, if_exists: true
    remove_column :users, :barangay, :string
  end

  # Reversible in shape but not in content: the column comes back empty and
  # every merged account stays `staff`, because which accounts used to be
  # barangay_staff is exactly what this migration destroys.
  def down
    add_column :users, :barangay, :string
    add_index :users, :barangay
    say 'barangay column restored empty — prior values and the role split are not recoverable'
  end
end
