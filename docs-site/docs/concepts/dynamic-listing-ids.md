# Dynamic listing IDs

Dynamic listing IDs let one deployment accept listings created after the app was deployed.

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
