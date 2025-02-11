"use client";

import { ScuteClient, ScuteUserData, Session } from "@scute/core";
import { Theme } from "@scute/ui-shared";
import { useEffect, useRef, useState } from "react";
import { initI18n, translate as t } from "./helpers/i18n/service";
import { Flex } from "./components";
import {
  DropdownAvatar,
  DropdownButton,
  DropdownEmail,
  DropdownItem,
  DropdownMenu,
  DropdownName,
  DropdownUserInfo,
  DropdownWrapper,
} from "./components/Dropdown";
import { useTheme } from "./ThemeContext";
import { createTheme } from "@stitches/react";
import { formatNational } from "./helpers/phone";
import { FlagImage } from "react-international-phone";
import { getISO2CountryCode } from "./helpers/phone";

export type UserButtonProps = {
  scuteClient: ScuteClient;
  language?: string;
  username?: string;
  profileUrl?: string;
  profilePictureUrl?: string;
  appearance?: {
    theme?: Theme;
  };
};

export const tryName = (user: ScuteUserData) => {
  const name = (user.meta?.name ||
    user.meta?.user_name ||
    user.meta?.username) as string | undefined;

  if (name) return name;

  const fullName = (user.meta?.full_name || user.meta?.fullname) as
    | string
    | undefined;

  if (fullName) return fullName;

  const firstName = (user.meta?.first_name || user.meta?.firstname) as
    | string
    | undefined;

  const lastName = (user.meta?.last_name || user.meta?.lastname) as
    | string
    | undefined;

  if (firstName) return `${firstName} ${lastName ?? ""}`;

  return null;
};

const UserButton = ({
  scuteClient,
  language,
  appearance,
  username,
  profileUrl,
  profilePictureUrl,
}: UserButtonProps) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<ScuteUserData | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const providerTheme = useTheme();

  useEffect(() => {
    initI18n(language);
  }, [language]);

  useEffect(() => {
    scuteClient.onAuthStateChange((_event, session, user) => {
      setSession(session);
      setUser(user);
      setName(username ? username : user ? tryName(user) : null);
    });
  }, [scuteClient]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const firstLetter = name ? name[0] : user?.email?.[0];

  return (
    user && (
      <DropdownWrapper
        ref={dropdownRef}
        className={
          appearance?.theme || providerTheme
            ? createTheme((appearance?.theme || providerTheme) as any)
            : ""
        }
      >
        <DropdownButton
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          css={{
            backgroundImage: profilePictureUrl
              ? `url("${profilePictureUrl}")`
              : undefined,
          }}
        >
          {!profilePictureUrl && <span>{firstLetter}</span>}
        </DropdownButton>
        {isDropdownOpen && (
          <DropdownMenu>
            <DropdownUserInfo>
              <DropdownAvatar
                css={{
                  backgroundImage: profilePictureUrl
                    ? `url("${profilePictureUrl}")`
                    : undefined,
                }}
              >
                {!profilePictureUrl && <span>{firstLetter}</span>}
              </DropdownAvatar>
              <Flex direction="column" css={{ width: "100%" }}>
                {name && <DropdownName>{name}</DropdownName>}
                <DropdownEmail css={{ mb: "$1" }}>
                  {user?.email?.slice(0, 24) +
                    ((user?.email?.length || 0) > 24 ? "..." : "")}
                </DropdownEmail>
                {user?.phone && (
                  <DropdownEmail
                    css={{ display: "block", whiteSpace: "nowrap" }}
                  >
                    {formatNational(user.phone)}
                  </DropdownEmail>
                )}
              </Flex>
            </DropdownUserInfo>
            {profileUrl && (
              <DropdownItem onClick={() => (window.location.href = profileUrl)}>
                {t("userButton.profile")}
              </DropdownItem>
            )}
            <DropdownItem onClick={() => scuteClient.signOut()}>
              {t("userButton.signOut")}
            </DropdownItem>
          </DropdownMenu>
        )}
      </DropdownWrapper>
    )
  );
};

export default UserButton;
