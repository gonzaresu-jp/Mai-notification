
                    const cb = document.getElementById('onlyHit');
                    cb.addEventListener('change', () => {
                        document.getElementById('list').classList.toggle('only-hit', cb.checked);
                    });
                