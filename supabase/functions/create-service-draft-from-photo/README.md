# create-service-draft-from-photo

Supabase Edge Function used by the Provider **Create from photo** service flow.

The app calls:

```js
supabase.functions.invoke('create-service-draft-from-photo', {
  body: {
    image_base64,
    mime_type,
  },
})
```

Required secret:

```sh
supabase secrets set OPENAI_API_KEY=your_openai_api_key
```

Optional secret:

```sh
supabase secrets set OPENAI_MODEL=gpt-4.1-mini
```

Deploy:

```sh
supabase functions deploy create-service-draft-from-photo
```

Expected response:

```json
{
  "draft": {
    "title": "Rural Fencing Repairs",
    "category": "Fencing",
    "short_description": "Fencing repairs for farms and lifestyle blocks.",
    "full_description": "Fencing repairs for farms and lifestyle blocks.",
    "service_area": "Waikato",
    "pricing_type": "quote_required",
    "price_amount": null,
    "pricing_notes": null,
    "availability": null,
    "equipment": [],
    "tags": ["fencing"],
    "contact_details_found": [],
    "missing_fields": ["Confirm pricing", "Add availability"],
    "confidence_notes": ["Pricing was not visible in the photo."]
  }
}
```
