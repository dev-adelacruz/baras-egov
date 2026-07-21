Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    # Set ALLOWED_ORIGINS (comma-separated) in production; defaults to "*" for dev.
    origins(*ENV.fetch('ALLOWED_ORIGINS', '*').split(',').map(&:strip))
    resource '*',
             headers: :any,
             methods: %i[get post put patch delete options head],
             expose: [:Authorization]
  end
end
