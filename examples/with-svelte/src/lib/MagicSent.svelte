<script lang="ts">
  export let identifier: string;
</script>

<div class="card">
  <h5>Magic Link Sent</h5>
  <p>
    Please check <strong>{identifier}</strong> for the magic link.
  </p>
</div>

<style>
  .card {
    width: 320px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 16px;
    border: 1px solid #ccc;
    padding: 16px;
    border-radius: 8px;
  }
</style>
