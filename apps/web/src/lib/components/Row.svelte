<script>
  let { title, items } = $props();
</script>

<section class="row">
  <h2>{title}</h2>
  <div class="track">
    {#each items as it (it.id)}
      <a class="card" href={'#/watch/' + it.id}>
        <div class="poster">
          <img loading="lazy" src={it.poster || '/icons/icon.svg'} alt={it.title} />
          {#if it.quality}
            <span class="quality">{it.quality}</span>
          {/if}
          {#if it.imdb}
            <span class="imdb">★ {it.imdb}</span>
          {/if}
        </div>
        <p class="name">{it.title}</p>
        {#if it.genres?.length}
          <p class="meta">{it.genres.slice(0, 2).join(' • ')}</p>
        {/if}
      </a>
    {/each}
  </div>
</section>

<style>
  .row {
    margin: 26px 0 6px;
  }
  h2 {
    font-size: 19px;
    font-weight: 700;
    margin: 0 22px 12px;
    position: relative;
    padding-inline-start: 12px;
  }
  h2::before {
    content: '';
    position: absolute;
    inset-inline-start: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 18px;
    border-radius: 4px;
    background: var(--accent);
  }
  .track {
    display: flex;
    gap: 13px;
    overflow-x: auto;
    padding: 4px 22px 14px;
    scroll-snap-type: x proximity;
  }
  .card {
    flex: 0 0 138px;
    scroll-snap-align: start;
  }
  .poster {
    position: relative;
    aspect-ratio: 2/3;
    border-radius: var(--radius);
    overflow: hidden;
    background: linear-gradient(135deg, var(--bg-2), var(--bg-3));
    box-shadow: var(--shadow);
    transition: transform 0.18s ease, box-shadow 0.18s ease;
  }
  .card:hover .poster {
    transform: translateY(-5px) scale(1.03);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
  }
  .card:active .poster {
    transform: translateY(-3px) scale(1.01);
  }
  .poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .quality {
    position: absolute;
    top: 8px;
    inset-inline-start: 8px;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(4px);
    color: #fff;
    font-size: 10.5px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 7px;
  }
  .imdb {
    position: absolute;
    bottom: 8px;
    inset-inline-end: 8px;
    background: rgba(0, 0, 0, 0.72);
    color: var(--gold);
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 7px;
  }
  .name {
    margin-top: 9px;
    font-size: 13.5px;
    font-weight: 600;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .meta {
    margin-top: 3px;
    font-size: 11.5px;
    color: var(--text-dim);
  }
</style>
