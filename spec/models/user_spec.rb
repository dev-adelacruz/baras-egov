# frozen_string_literal: true

require 'rails_helper'

RSpec.describe User do
  describe '#validations' do
    it { is_expected.to validate_presence_of(:email) }

    it 'requires a barangay for barangay staff' do
      user = build(:user, :barangay_staff, barangay: nil)
      expect(user).not_to be_valid
      expect(user.errors[:barangay]).to be_present
    end

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
      expect(build(:user, :barangay_staff)).to be_barangay_staff
    end

    it 'delegates #can? to the permission policy' do
      staff = build(:user, :municipal_staff, office: 'civil_registry')
      expect(staff.can?(:civil_registry, :write)).to be(true)
      expect(staff.can?(:treasury, :read)).to be(false)
    end
  end

  describe 'data scoping' do
    it 'scopes barangay staff to their barangay' do
      user = build(:user, :barangay_staff, barangay: 'Barangay Uno')
      expect(user).to be_barangay_scoped
      expect(user.data_scope).to eq(barangay: 'Barangay Uno')
    end

    it 'gives municipality-wide users an :all scope' do
      user = build(:user, :municipal_staff)
      expect(user).not_to be_barangay_scoped
      expect(user.data_scope).to eq(:all)
    end
  end
end
