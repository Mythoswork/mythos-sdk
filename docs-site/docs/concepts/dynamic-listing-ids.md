# Dynamic listing IDs

Dynamic listing IDs let one deployment accept listings created after the app was deployed.

Set `MYTHOS_KEY` from Dashboard → Settings → Mythos key before accepting auto-registration. The SDK checks the same `pkh` binding on callback, handshake and launch tokens; a mismatch is HTTP 401 and never reaches the registration callback. Without a key, a resolver or callback emits a once-per-process startup warning in 0.5.0. The key will be required in 0.6.0. See the [binding matrix and exact warning](../reference/configuration.md).

## Node

Provide a resolver and a persistence callback when creating the SDK instance:

```ts
export const mythos = createMythos({
  resolveListingIds: async () => listingStore.getIds(),
  onListingRegistered: async (listingId) => listingStore.add(listingId),
});
```

`resolveListingIds` is optional and returns every listing ID accepted by this deployment. `onListingRegistered` is optional; setting it enables the listing-registered callback route.

## Python

```python
mythos = create_mythos(
    resolve_listing_ids=listing_store.get_ids,
    on_listing_registered=listing_store.add,
)
app.include_router(mythos.router)
```

Persist callbacks idempotently because Mythos may retry delivery. When the resolver supplies at least one ID, `MYTHOS_LISTING_ID` and `MYTHOS_LISTING_IDS` are optional.
