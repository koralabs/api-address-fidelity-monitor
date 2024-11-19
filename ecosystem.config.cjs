module.exports = {
  apps: [
    {
      name: 'resolver',
      script: 'npm start',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm Z',
    },
  ],
};
