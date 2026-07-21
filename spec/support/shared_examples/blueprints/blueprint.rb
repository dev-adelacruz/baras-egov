# frozen_string_literal: true
RSpec.shared_examples 'a blueprint' do
  let(:custom_attributes) { {} }
  let(:stringifiable_keys) { {} }
  let(:result) do
    JSON.parse(described_class.render(record), symbolize_names: true)
  end
  let(:stringified_values) do
    stringifiable_keys.index_with do |key|
      record[key].to_s
    end
  end
  describe '#render' do
    it 'renders the correct body' do #rubocop:disable RSpec/ExampleLength
      attributes = if record.respond_to?(:attributes)
                     record.attributes
                   elsif record.respond_to?(:to_h)
                     record.to_h
                   else
                     JSON.parse(record.to_json, symbolize_names: true)
                   end
      expect(result.keys).to match_array(expected_keys)
      expect(result).to match(
        attributes
          .symbolize_keys
          .slice(*expected_keys)
          .merge(
            custom_attributes,
            stringified_values
          )
      )
    end
  end
end
