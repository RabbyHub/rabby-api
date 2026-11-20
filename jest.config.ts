export default {
  testEnvironment: 'jsdom',
  transformIgnorePatterns: ['<rootDir>/node_modules/(?!@rabby-wallet)'],
  resetMocks: false,
  transform: {
    '^.+\\.js$': 'babel-jest',
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.(svg|png|jpg)$': '<rootDir>/svgTransform.js',
  },
};
