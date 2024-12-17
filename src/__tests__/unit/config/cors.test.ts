import { corsOptions } from '../../../config/cors';

type OriginCallback = (err: Error | null, origin?: boolean) => void;

describe('cors configuration', () => {
  const originFn = corsOptions.origin as (
    origin: string | undefined,
    cb: OriginCallback
  ) => void;

  it('should allow requests from localhost:5173', () => {
    const origin = 'http://localhost:5173';
    const callback = jest.fn();

    originFn(origin, callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('should allow requests from localhost:3000', () => {
    const origin = 'http://localhost:3000';
    const callback = jest.fn();

    originFn(origin, callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('should allow requests with no origin', () => {
    const origin = undefined;
    const callback = jest.fn();

    originFn(origin, callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('should block requests from unauthorized origins', () => {
    const origin = 'http://unauthorized-origin.com';
    const callback = jest.fn();

    originFn(origin, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Not allowed by CORS',
      })
    );
  });

  it('should have credentials enabled', () => {
    expect(corsOptions.credentials).toBe(true);
  });

  it('should expose x-auth-token header', () => {
    expect(corsOptions.exposedHeaders).toContain('x-auth-token');
  });
});
