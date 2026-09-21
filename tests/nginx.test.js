process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const request = require('supertest');

const HTTP_URL = process.env.TEST_HTTP_URL;
const HTTPS_URL = process.env.TEST_HTTPS_URL

describe('testing reverse proxy', () => {
  test('get request to http', async () => {

    const response = await request(HTTP_URL)
      .get('/')
      .timeout(2000);

    expect([301, 302]).toContain(response.status);
    expect(response.headers.location).toMatch(/^https:/);

  });
  test('get request to https', async () => {
    const response = await request(HTTPS_URL)

      .get('/')
      .timeout(2000);

      expect(response.status).toBe(200);
      expect(response.headers['content-type'].toMatch(/text\/html/);
      expect(response.text).toMatch(/<!DOCTYPE html>/);

  });
});
