const debounce = require('lodash/debounce');
const {
  gql,
  ApolloLink,
  InMemoryCache,
  ApolloClient,
  Observable,
} = require('@apollo/client');

describe('ApolloClient', () => {
  it('should deduplicate queries with client fields and resolvers', async () => {
    const performedOperations = [];
    // To simulate BatchHttpLink, but with mocked responses (like MockLink, but batched).
    const getBatchMockLink = (mocks) => {
      const observers = [];

      const resolveDebounced = debounce(() => {
        do {
          const observer = observers.shift();
          const mock = mocks.shift();
          observer.next(mock.result);
          observer.complete();
        } while (observers.length);
      }, 10);

      return new ApolloLink((operation) => {
        performedOperations.push(operation.operationName);

        return new Observable((observer) => {
          observers.push(observer);
          resolveDebounced();
        });
      });
    };

    const query = gql`
      query A {
        a
        c @client
      }
    `;

    const query2 = gql`
      query B {
        b
      }
    `;

    const cache = new InMemoryCache({
      typePolicies: {Query: {fields: {c: () => 9}}},
    });

    const client = new ApolloClient({
      connectToDevTools: false,
      // IMPORTANT. Deduplication works properly when resolvers are not specified.
      resolvers: {},
      // IMPORTANT for queries to be batched (to be resolved together synchronously).
      // Also reproduced with BatchHttpLink.
      link: getBatchMockLink([
        {
          request: {query},
          result: {data: {a: 1}},
        },
        {
          request: {query: query2},
          result: {data: {b: 2}},
        },
        // This mock should not be used, but it does:
        {
          request: {query},
          result: {data: {a: 3}},
        },
      ]),
      cache,
    });

    // No await to batch with query2
    client.query({query});
    await client.query({query: query2});
    expect(performedOperations).toEqual(['A', 'B']);

    // The same query should be resolved from cache (or at least deduplicated), but it doesn't.
    await client.query({query});
    expect(performedOperations).toEqual(['A', 'B']);
  });
});
