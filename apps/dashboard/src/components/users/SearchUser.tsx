"use client";

import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { TextField } from "@radix-ui/themes";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export const SearchUser = () => {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function handleSearch(term: string) {
    const params = new URLSearchParams(window.location.search);
    if (term) {
      params.set("q", term);
    } else {
      params.delete("q");
    }

    startTransition(() => {
      router.replace(`${pathname}?${params}`);
    });
  }

  return (
    <>
      {isPending && <div>...</div>}
      <TextField.Root>
        <TextField.Slot>
          <MagnifyingGlassIcon height="16" width="16" />
        </TextField.Slot>
        <TextField.Input
          placeholder="Search users"
          onChange={(e) => handleSearch(e.target.value)}
        />
      </TextField.Root>
    </>
  );
};
