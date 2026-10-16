process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const request = require('supertest');

const HTTP_URL = TEST_HTTP_URL || 'http://nginx:80';

describe('testing reverse proxy', () => {

  test('get request to http', async () => {

    const response = await request(HTTP_URL)
      .get('/')
      .redirects(1)
      .timeout(2000);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/html/);
    expect(response.text).toMatch(/<!doctype html>/)

  });

  test('redirect from 80 to 443', () => {

    const response = await request(HTTP_URL)
      .get('/')
      .redirects(0)
      .timeout(2000);

    expect([301, 302]).toContain(response.status);
    expect(response.headers['location'].toBeDefined();
    expect(response.headers['location'].toMatch(/^https:\/\//);

  });
});
