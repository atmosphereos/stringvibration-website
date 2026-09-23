process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const request = require('supertest');

const HTTP_URL = process.env.TEST_HTTP_URL || 'http://localhost:8080';

describe('testing reverse proxy', () => {
  test('get request to http', async () => {

    const response = await request(HTTP_URL)
      .get('/')
      .redirects(1)
      .timeout(2000);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/html/);
    expect(response.text).toMatch(/<!DOCTYPE html>/)

  });
});
