# frozen_string_literal: true

require 'rails_helper'

RSpec.describe User do
  describe '#validations' do
    it { is_expected.to validate_presence_of(:email) }

    it 'rejects an office that is not a known module' do
      user = build(:user, office: 'not_a_module')
      expect(user).not_to be_valid
      expect(user.errors[:office]).to be_present
    end

    it 'allows a nil office' do
      expect(build(:user, :admin, office: nil)).to be_valid
    end
  end

  describe 'roles and permissions' do
    it 'exposes role predicates' do
      expect(build(:user, :admin)).to be_admin
      expect(build(:user, :staff)).to be_staff
    end

    # BRGY-136 merged barangay_staff into staff. The enum is integer-backed and
    # the integers did not move, so this pins that the retired name is gone
    # rather than merely unused — a stray `barangay_staff` anywhere would now
    # raise instead of silently resolving.
    it 'offers exactly three roles, with staff on the old municipal_staff value' do
      expect(described_class.roles).to eq('admin' => 0, 'department_head' => 1, 'staff' => 2)
    end

    it 'delegates #can? to the permission policy' do
      staff = build(:user, :staff, office: 'certifications')
      expect(staff.can?(:certifications, :write)).to be(true)
      expect(staff.can?(:treasury, :read)).to be(false)
    end
  end

  # BRGY-127. This predicate is the whole lockout guard — if it is wrong in the
  # permissive direction the barangay loses access to its own system, and the
  # recovery is a rake task somebody has to be found to run.
  describe '#sole_active_admin?' do
    it 'is true for the only administrator who can sign in' do
      admin = create(:user, :admin)
      create(:user, :staff)

      expect(admin).to be_sole_active_admin
    end

    it 'is false once a second active administrator exists' do
      admin = create(:user, :admin)
      create(:user, :admin)

      expect(admin).not_to be_sole_active_admin
    end

    it 'does not count a deactivated administrator as a second one' do
      # The one that matters: a deactivated admin cannot authenticate, so it
      # is no help to anybody locked out. Counting it would make the guard
      # stand down at exactly the wrong moment.
      admin = create(:user, :admin)
      create(:user, :admin, active: false)

      expect(admin).to be_sole_active_admin
    end

    it 'is false for a non-admin, however alone they are' do
      expect(create(:user, :staff)).not_to be_sole_active_admin
    end

    it 'is false for an already-deactivated administrator' do
      # Nothing left to protect: this account cannot sign in either way.
      expect(create(:user, :admin, active: false)).not_to be_sole_active_admin
    end
  end
end
