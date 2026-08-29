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
end
