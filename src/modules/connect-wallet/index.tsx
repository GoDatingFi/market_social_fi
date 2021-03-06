import { ConnectWalletSteps, PersonalInfo } from 'utils/interfaces';
import { getMetamaskInfo, verifySignedMessage, updateUser } from 'api/user/index.api';
import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FoxPng from 'assets/images/fox.png';
import Image from 'next/image';
import { ERRORS, METAMASK_DOWNLOAD_LINK, CURRENCY_UNIT_NAME } from 'utils/constant';
import { SC } from 'utils/smart-contract';
import WalletConnectPng from 'assets/images/wallet-connect.png';
import useLocalStorage from 'hooks/useLocalStorage';
import useWeb3 from 'hooks/useWeb3';
import DownloadSvg from 'assets/images/icons/new-download.svg';
import DotSpinnerSvg from 'assets/images/icons/dotSpinner.svg';
import FailSvg from 'assets/images/icons/fail.svg';
import { navigateDisconnect } from 'utils/router/navigate-disconnect.route';
import { useRouter } from 'next/router';
import { isEmpty } from 'utils/functions';
import Input from 'components/input';
import Modal from 'components/modal';
import Button from 'components/button';
import classNames from 'classnames/bind';
import styles from './index.module.scss';
const cx = classNames.bind(styles);

const removeWhiteSpaceRegxp = /\s+/g;

interface Props {
  startStep: ConnectWalletSteps;
  isShowModal: boolean;
  closeModal: () => void;
  connectSuccessCb?: (params?: any) => void;
  isChangeWallet?: boolean;
  isWalletConnectConnectedBefore?: boolean;
  setIsChangeWallet?: Dispatch<SetStateAction<boolean>>;
  setIsWalletConnectConnectedBefore?: Dispatch<SetStateAction<boolean>>;
}

interface IError {
  email: string[];
  username: string[];
}
const ConnectWallet = ({
  isShowModal,
  closeModal,
  connectSuccessCb,
  isChangeWallet = false,
  isWalletConnectConnectedBefore = false,
  setIsWalletConnectConnectedBefore = () => {},
  setIsChangeWallet = () => {},
}: Props) => {
  const web3 = useWeb3();
  const wrongNetworkStatus = useRef(false);
  const [step, setStep] = useState<ConnectWalletSteps>('init');
  const [isWalletConnect, setIsWalletConnect] = useState<boolean>(false);
  const [userInfo, setUserInfo] = useState({
    username: '',
  });
  const router = useRouter();
  const [errors, setErrors] = useState<IError>({ email: [], username: [] });
  const [personalInfo, setPersonalInfo] = useLocalStorage<PersonalInfo | null>('personal-info', null);

  useEffect(() => {
    if (isShowModal) {
      wrongNetworkStatus.current = false;
      setStep('init');
    }
  }, [isShowModal]);

  const validateUserInfo = useCallback(() => {
    const errors: any = {};
    const usernameRegex = /^[\w-\._]+$/g;

    if (!usernameRegex.test(userInfo.username) && userInfo.username.length > 0) {
      errors.username = errors.username ? errors.username.push(ERRORS.E12) : [ERRORS.E12];
    }

    if (userInfo.username.length >= 0 && userInfo.username.length <= 6) {
      errors.username = errors.username ? [...errors.username, ERRORS.E2('Username', 6)] : [ERRORS.E3('Username', 6)];
    }

    if (userInfo.username.length > 256) {
      errors.username = errors.username
        ? [...errors.username, ERRORS.E3('Username', 256)]
        : [ERRORS.E3('Username', 256)];
    }

    return errors;
  }, [userInfo]);

  const handleUpdateProfile = useCallback(async () => {
    const validateErrors = validateUserInfo();
    if (!isEmpty(validateErrors)) {
      setErrors(validateErrors);
      return;
    }

    try {
      await updateUser({ username: userInfo.username });
      const updatedInfo = {
        ...personalInfo,
        username: userInfo.username,
      } as PersonalInfo;
      setPersonalInfo(updatedInfo);
    } catch (error: any) {
      if (error.errors && error.errors.message) {
        if (error.errors.message.search('Username') > -1) {
          validateErrors.username = validateErrors.username
            ? [...validateErrors.username, ERRORS.E0('Username')]
            : [ERRORS.E0('Username')];
        }
      }
    }
    isEmpty(validateErrors) ? closeModal() : setErrors(validateErrors);
  }, [closeModal, personalInfo, setPersonalInfo, userInfo.username, validateUserInfo]);

  const handleLogin = useCallback(async (walletAddress: string, signature: string) => {
    try {
      const userInfo = await verifySignedMessage({ walletAddress, signature });
      return userInfo.data;
    } catch (error) {
      setStep('error-connecting');
      return null;
    }
  }, []);

  const handleShowMetaNotiToSign = useCallback(
    async (address: string, nonce: string) => {
      try {
        const signature = await web3.signIn({
          nonce,
          address,
          errorCb: (error: Error) => {
            if (error) {
              setStep('error-connecting');
            }
          },
        });
        return signature;
      } catch (_) {
        setStep('error-connecting');
        return '';
      }
    },
    [web3],
  );

  const handleConnect = useCallback(async () => {
    const address = await web3.getAddress();
    try {
      const metamaskInfo = await getMetamaskInfo(address);
      const nonce = metamaskInfo?.data?.data;
      const signature = await handleShowMetaNotiToSign(address, nonce);
      if (!signature) {
        return;
      }

      const personalInfo = await handleLogin(address, signature);

      if (!personalInfo) {
        return;
      }

      if (!personalInfo?.data?.username) {
        setUserInfo({ username: '' });
        setStep('update-profile');
      } else {
        closeModal();
      }

      setPersonalInfo(personalInfo.data);

      setIsWalletConnectConnectedBefore(false);
      web3.setChangeWalletRef('empty');
      connectSuccessCb?.();
      if (isChangeWallet && web3.isWalletConnected) {
        await web3.disconnectWalletConnect();
        router.reload();
      }
    } catch (error) {
      setStep('error-connecting');
    }
  }, [
    closeModal,
    connectSuccessCb,
    handleLogin,
    handleShowMetaNotiToSign,
    setPersonalInfo,
    web3,
    setIsWalletConnectConnectedBefore,
    isChangeWallet,
    router,
  ]);

  const handleConnectWallet = useCallback(async () => {
    setIsWalletConnect(false);

    if (!web3.isMetamaskInstalled) {
      setStep('metamask-not-found');
      return;
    }
    setStep('connecting-to-metamask');
    try {
      await web3.createWeb3Instance();
    } catch (error: any) {
      setStep('error-connecting');
    }
    try {
      await web3.addEthereumChain(CURRENCY_UNIT_NAME.MATIC);
      const chainID = await web3.getNetworkChainID();
      if (
        web3.isHex(chainID)
          ? chainID !== SC[CURRENCY_UNIT_NAME.MATIC].chainId
          : web3.toHex(chainID) !== SC[CURRENCY_UNIT_NAME.MATIC].chainId
      ) {
        setStep('wrong-network');
        wrongNetworkStatus.current = true;
      } else {
        handleConnect();
        wrongNetworkStatus.current = false;
      }
    } catch (error) {
      setStep('error-connecting');
    }
  }, [handleConnect, web3]);

  useEffect(() => {
    web3.listenWalletConnectSessionReject(async (error: any, payload: any, _isClearData: boolean) => {
      if (web3.isWalletConnecting && !wrongNetworkStatus.current && !isWalletConnectConnectedBefore) {
        setStep('error-connecting');
      }
      if (web3.isWalletConnecting && wrongNetworkStatus.current) {
        setStep('wrong-network');
      }
      if (web3.isWalletConnected) {
        //signout button
        if (_isClearData && window.location.pathname === router.asPath) {
          setPersonalInfo(null);
          navigateDisconnect(router);
        }
        setIsChangeWallet(false);
        setIsWalletConnectConnectedBefore(false);
      }
    });
  }, [
    web3,
    setPersonalInfo,
    router,
    setIsChangeWallet,
    setIsWalletConnectConnectedBefore,
    isChangeWallet,
    isWalletConnectConnectedBefore,
  ]);

  const handleConnectWalletConnect = useCallback(async () => {
    try {
      setStep('connecting-to-metamask');
      const accounts = await web3.walletConnect();
      const metamaskInfo = await getMetamaskInfo(accounts[0].toLowerCase());
      const nonce = metamaskInfo?.data?.data;
      const signature = await web3.signWalletConnect(nonce, accounts[0], (error: any) => {
        if (error) {
          setStep('error-connecting');
        }
      });

      if (web3.getWalletConnectChainId() !== SC[CURRENCY_UNIT_NAME.MATIC].chainIdNumber) {
        wrongNetworkStatus.current = true;
        setStep('wrong-network');
        await web3.disconnectWalletConnect();
        return;
      }

      const personalInfo = await handleLogin(accounts[0].toLowerCase(), signature);
      if (!personalInfo) {
        return;
      }

      setPersonalInfo(personalInfo.data);

      if (!personalInfo?.username) {
        setUserInfo({ username: '' });
        setStep('update-profile');
      } else {
        closeModal();
      }

      setIsChangeWallet(false);
      setIsWalletConnectConnectedBefore(true);
      web3.setChangeWalletRef('empty');
      connectSuccessCb?.();
      if (isChangeWallet && !web3.isWalletConnected) {
        await web3.disconnect();
        router.reload();
      }
    } catch (error: any) {
      console.error(error, 'error');
      setStep('error-connecting');
    }
  }, [
    web3,
    handleLogin,
    closeModal,
    connectSuccessCb,
    setPersonalInfo,
    setIsChangeWallet,
    setIsWalletConnectConnectedBefore,
    isChangeWallet,
    router,
  ]);

  const handleClickWalletConnect = useCallback(async () => {
    setIsWalletConnect(true);
    try {
      await handleConnectWalletConnect();
    } catch (error) {
      setStep('error-connecting');
    }
  }, [handleConnectWalletConnect]);

  const handleSwitchNetwork = useCallback(async () => {
    if (!isWalletConnect) {
      await web3.switchNetwork(CURRENCY_UNIT_NAME.MATIC);
      setStep('connecting-to-metamask');
      handleConnect();
    } else {
      closeModal();
    }
  }, [web3, isWalletConnect, closeModal]);

  useEffect(() => {
    web3.listenNetworkChange((chainID: any) => {
      if (wrongNetworkStatus.current && chainID === SC[CURRENCY_UNIT_NAME.MATIC].chainId) {
        setStep('connecting-to-metamask');
        handleConnect();
      }
      wrongNetworkStatus.current = false;
    });
  }, [handleConnect, web3]);

  const initStep = useMemo(() => {
    return (
      <div className={cx('wrapper')}>
        <div className="gdf-title">Connect to a Wallet</div>
        <div className="gdf-desc">{'Please connect with one of our available wallet providers to continue'}</div>
        <Button
          onClick={handleConnectWallet}
          rightIcon={<Image src={FoxPng} alt="icon" width={40} height={40} />}
          leftIcon={<span className="label">Metamask</span>}
          disabled={isChangeWallet && !isWalletConnectConnectedBefore}
          className={cx('init-button', { active: isChangeWallet && !isWalletConnectConnectedBefore })}
        />
        {/*<Button*/}
        {/*  onClick={handleConnectWallet}*/}
        {/*  rightIcon={<Image src={WalletConnectPng} alt="icon" width={40} height={40} />}*/}
        {/*  leftIcon={<span className="label">WalletConnect</span>}*/}
        {/*  disabled={isChangeWallet && isWalletConnectConnectedBefore}*/}
        {/*  className={cx('init-button', { active: isChangeWallet && isWalletConnectConnectedBefore })}*/}
        {/*/>*/}
      </div>
    );
  }, [handleConnectWallet, handleClickWalletConnect, isChangeWallet, isWalletConnectConnectedBefore]);

  const metamaskNotFoundStep = useMemo(() => {
    return (
      <div className={cx('wrapper')}>
        <div className={cx('install-metamask')}>
          <Image src={FoxPng} alt="fox-icon" width={56} height={56} />
        </div>
        <div className="gdf-title">Metamask Not Found</div>
        <div className="gdf-desc">Don&#39;t have Metamask Wallet?</div>
        <a className={cx('download')} href={METAMASK_DOWNLOAD_LINK} target="_blank" rel="noreferrer">
          <span>Download MetaMask</span>
          <DownloadSvg width={20} height={20} />
        </a>
      </div>
    );
  }, []);

  const connectingToMetamaskStep = useMemo(() => {
    return (
      <div className={cx('wrapper')}>
        <DotSpinnerSvg className={cx('dot-spinner')} width={56} height={56} />
        <div className="gdf-title">Initializing</div>
        <div className="gdf-desc">Connecting to a wallet...</div>
      </div>
    );
  }, []);

  const errorConnectingStep = useMemo(() => {
    return (
      <div className={cx('wrapper')}>
        <div className={cx('install-metamask')}>
          <FailSvg width={56} height={56} />
        </div>
        <div className="gdf-title">Failed</div>
        <div className="gdf-desc">
          Connecting to a wallet failed.
          <br />
          Please try again
        </div>
      </div>
    );
  }, []);

  const updateProfileStep = useMemo(() => {
    return (
      <>
        <div className={cx('wrapper')}>
          <div className="gdf-title">Update your profile</div>
          <div className={cx('group-input')}>
            <div className="input-label">Username</div>
            <Input
              className={cx('')}
              placeholder="Please enter your username"
              value={userInfo.username}
              onChange={(e) => {
                const username = e.target.value.replace(removeWhiteSpaceRegxp, '');
                setErrors((prev) => ({ ...prev, username: [] }));
                setUserInfo((prev) => ({ ...prev, username }));
              }}
            />
            {errors && errors.username && (
              <div className={cx('error-alert')}>
                {errors.username.map((error: string, idx: number) => (
                  <span key={idx}>{error}</span>
                ))}
              </div>
            )}
          </div>
          <div className={cx('group-action')}>
            <Button className={cx('btn-update')} onClick={handleUpdateProfile}>
              Update
            </Button>
          </div>
        </div>
      </>
    );
  }, [closeModal, handleUpdateProfile, userInfo.username, setErrors, errors]);

  const wrongNetworkStep = useMemo(() => {
    return (
      <div className={cx('wrapper')}>
        <div className={cx('install-metamask')}>
          <FailSvg width={64} height={64} />
        </div>
        <div className="gdf-title">Wrong Network</div>
        <div className="gdf-desc">Please change network on your wallet to</div>
        <div className={cx('network-name')} onClick={handleSwitchNetwork}>
          {SC[CURRENCY_UNIT_NAME.MATIC].chainName}
        </div>
      </div>
    );
  }, [handleSwitchNetwork]);

  const connectSteps = useMemo(
    () => ({
      init: initStep,
      'metamask-not-found': metamaskNotFoundStep,
      'connecting-to-metamask': connectingToMetamaskStep,
      'error-connecting': errorConnectingStep,
      'wrong-network': wrongNetworkStep,
      'update-profile': updateProfileStep,
    }),
    [
      initStep,
      metamaskNotFoundStep,
      connectingToMetamaskStep,
      errorConnectingStep,
      wrongNetworkStep,
      updateProfileStep,
    ],
  );

  return (
    <Modal
      isShow={isShowModal}
      close={closeModal}
      content={connectSteps[step]}
      preventClickOutside={true}
      showCloseBtn={step !== 'connecting-to-metamask' && step !== 'wrong-network'}
      className={cx('module-connect', step)}
    />
  );
};

export default ConnectWallet;
